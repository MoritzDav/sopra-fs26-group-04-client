# Contributions

Every member has to complete at least 2 meaningful tasks per week, where a
single development task should have a granularity of 0.5-1 day. The completed
tasks have to be shown in the weekly TA meetings. You have one "Joker" to miss
one weekly TA meeting and another "Joker" to once skip continuous progress over
the remaining weeks of the course. Please note that you cannot make up for
"missed" continuous progress, but you can "work ahead" by completing twice the
amount of work in one week to skip progress on a subsequent week without using
your "Joker". Please communicate your planning **ahead of time**.

Note: If a team member fails to show continuous progress after using their
Joker, they will individually fail the overall course (unless there is a valid
reason).

**You MUST**:

- Have two meaningful contributions per week.

**You CAN**:

- Have more than one commit per contribution.
- Have more than two contributions per week.
- Link issues to contributions descriptions for better traceability.

**You CANNOT**:

- Link the same commit more than once.
- Use a commit authored by another GitHub user.

---

## Contributions Week 1 - [23.03] to [29.03]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [28.03]   | [86c8e5d](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/86c8e5d) | Added login page | Needed for the website otherwise not usable |
|                    | [28.03]   | [e0d6bd1](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/e0d6bd1) | Added AuthGuard | So only logged in users can join courses |
| **[@AQuant1](https://github.com/AQuant1)** | [26.03] | [1a6fe87](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/1a6fe87179926dbdd86ab7e9b51a7935e1ee393e) | Added welcome page | sets the entry point of the web app |
|                    | [26.03] | [9da325f](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/9da325fc7c829d675a9de9485bee665de35d68ee) | Added Registration of both Student and Teacher | Allows the user to sing up |
| **[@Bablandan](https://github.com/Bablandan)** | [27.03]   | [0787fe2](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/0787fe2adbbb586cf5e083e6544f1272c91316c0) | Creating Course entity and CourseService, CourseController, CourseRepo and updated mapping such that creation of a course as a teacher is possible | It's necessary that courses can be created that later students can join them and sessions can be launched. Courses are only hosted by teachers. |
|                    | [27.03]   | [acf4246](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/acf4246184514a4ede31af7557201123085f0484); [969c22e](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/969c22ec312114b91cadaa3c944366ad28af5590) | Creating user entity including Service, Controller and Mapping as well as enumeration constant for user and teacher including POST-API for user registration | This is relevant because without user no courses can be created and it's important to distinguish between teacher/student. |
| **[@Meimira](https://github.com/Meimira)** | [28.03]   | [4b59c3f](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/4b59c3f95e3f6d0dc65bbc69c858c2b1145315c6) | Handling redirection after registration/ login and security for dashboard. | This is relevant because users must see their course overview after registration and only the authenticated role is allowed to see specific pages.|
|                    | [29.03]   | [739a176](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/739a17671fa7f429ce1d1acb40286c91a26b03ba); [2bf7f93](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/2bf7f936cf5545354f6c79191c60cacf4a87a225)  | Showing course overview for teachers and students individually | This relevant because users must see their courses they are enrolled in/ created. |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [29.03]   | [05e7c25](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/05e7c258cc70dc71003993deccc75c742efc8fb7) | Add QR code generation and code generation | Part of the user story 3 |
|                    | [29.03]   | [0e106a0](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/0e106a07d2fd8e0aa93157907478d419ff90a46c)| Add course enrollment system | Part of the user story 3 |


---

## Contributions Week 2 - [30.03] to [05.04]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [05.04]   | [ef01221](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/ef01221) | added a logout button | So users can logout when finished with a session |
|                    | [05.04]   | [0b15d32](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/0b15d32) | Clearing local storage and redirecting after logout | That the logout works as intended |
| **[@AQuant1](https://github.com/AQuant1)** | [05.04] | [ba64841](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/ba648411bd990cedc830ae348592627886ac6cfe) | Added profile page and password change | Users need to view and update their credentials |
|                    | [05.04] | [d4f84db](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/d4f84db22544e88016ae582c7c483fd3a464d1e9) | Added join course page | Students need to join courses via course code |
| **[@Bablandan](https://github.com/Bablandan)** | [date]   | Joker | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | Joker| [Brief description of the task] | [Why this contribution is relevant] |
| **[@Meimira](https://github.com/Meimira)** | [05.04]   | [205740c](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/205740ce8e78230ba7bcc0d2d8a3e1f021bc8fe8) | Both dashboards (student and teacher) are now dynamic, meaning they only see their own courses they are enrolled in. Additionally the profil icon are now individual. | Users must see their own courses and no one elses. |
|                    | [05.04]   | [205740c](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/205740ce8e78230ba7bcc0d2d8a3e1f021bc8fe8) | Both dashboard have now links to the course page and the profile page. Additionally a teacher can now navigate to editCourse, delete his course and share the course code with the display of a QR Code | Users must be able to navigate to course page and their profile. A teacher must be able to delete and share his course. |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [05.04]   | [c3d90aa](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/c3d90aafff9da0d7ae5af6e343b4430bfa92fd37) | Add course email generation and user retrieval functionality | Outlook message is part of the user story |
|                    | [05.04]   | [afba6b3](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/afba6b391334502362d0dff2ffeea3fdc2af87b8) | Implement user login and logout functionality+unit tests | essential for the app |

---

## Contributions Week 3 - [06.04.] to [19.04.]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [07.04]   | [1dc8e27](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/1dc8e27) | Added not blank annotations for username, firstname, lastname, password | So you cannot register with empty credentials |
|                    | [11.04]   | [deb2631](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/47) | Created a whiteboard for the main functionality of the website | To draw, add notes, explain and share ideas |
| **[@AQuant1](https://github.com/AQuant1)** | [16.04] | [ea7e56e](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/ea7e56e440ef7145bf61f8da5794887223339cef) | Added React Context Provider for global user state management | Replaces scattered localStorage reads with a single source |
|                    | [16.04] | [90b1735](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/90b1735d43e16ff69a0b0c769859ce92c5542055) | Added split-view session page with teacher + student whiteboards, course page with sessions, chat panel scaffold | Students can now attend sessions and take personal notes while watching the teacher's whiteboard |
| **[@Bablandan](https://github.com/Bablandan)** | [10.04.]   | [9320b20](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/9320b20a4cb83bca5ff0f2c761fd952a5ebbd880) | Creating PUT and DELETE endpoints to change or delete a course including safety check that the corresponding teacher does it + unit tests for the specific endpoints and service function | It's necessary to change and delete courses for the functionality of our App and testing it as well |
|                    | [11.04.]   | [0ce3170](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/0ce3170105c22fbc60a689c612e453ccd582f7f8) | Setting up all necessary entities alon UML Class diagram to create a session and provide a whiteboard | This is the basic structure for our main functionality of the app |
| **[@Meimira](https://github.com/Meimira)** | [18.04]   | [e2c901c](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/48/changes/e2c901c686156513d7d75c7be1179c0f21bc2c1b) | Form to change course data now shows previous data and background images can be edited | Chaning course data is now more user firendly and complete |
|                    | [18.04]   | [e3a24f2](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/49/changes/e3a24f2a80b3c3ea471ea669419cdd7753651db9) | Teachers can now create new courses. | Teachers must be able to create new courses. |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [18.04]   | [90483a2](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/90483a2d496569d3a628275948b2cfc36fc5e6de) | session management tests for UserService and CourseEnrollmentService | tests for main functionalities |
|                    | [19.04]   | [0c03a63](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/0c03a630f5d8329f96d8f546f4b98fd01fd55ca8) | WebSocket support for whiteboard functionality and related tests | for our interactive feature |

---

## Contributions Week 4 - [20.04] to [24.04]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [21.04]   | [83052bc](https://github.com/MoritzDav/sopra-fs26-group-04-server/pull/104) | created put endpoint and updateUser functionality | to update credentials |
|                    | [21.04]   | [b55007c](https://github.com/MoritzDav/sopra-fs26-group-04-server/pull/111) | added CourseCreationTests, CourseEnrollnmentTests and UserControllertest | to test the internal logic |
| **[@AQuant1](https://github.com/AQuant1)** | [23.04] | [78e2ee5](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/78e2ee59d32746adb384beb55d05f39bc51afadc) | Added WebSocket broadcasting of teacher whiteboard strokes + refactored session and course flow | Enables teachers to live-share their whiteboard drawings during a session |
|                    | [23.04] | [cfa0df2](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/cfa0df2549fbc8a4cba669a0ac24d4221727a70f) | Added student reception of teacher whiteboard drawings via WebSocket + refactored enrollment and student dashboard | Students now see the teacher's live drawings in real time, completes the live-share feature |
| **[@Bablandan](https://github.com/Bablandan)** | [19.04.]   | [469e40f](https://github.com/MoritzDav/sopra-fs26-group-04-server/pull/106/commits/469e40f51a7580a78780000d413d5bc5d990f3d0) inside Pull Request [679383e](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/679383e377eed232ff2b1a2e8e56b78c89a9fc35)| Creating POST and PUT endpoints to start/create a session and to end it  | necessary to launch a session including whiteboard to work collaboratively |
|                    | [22.04.]   | [75ca17c](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/75ca17cf05d60aaf7b3943d9ac5d69883edb5a95) and some testings to get the score up [e55b737](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/e55b7371321f15e2f95c959a2f27614757f51fae)| Setting up endpoints such that teacher/student sees an overview of all courses they're currently enrolled in in the dashboard | necessary to be able to click on courses in order to then join a session |
| **[@Meimira](https://github.com/Meimira)** | [24.04]   | [2767b3f](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/58/changes/2767b3ff47bc0e81950708e565f1c6f9e7cb7325) | Courses can now be shared via Outlook and the redirection and security is now implemented for when a course is created.| Sharing via outlook adds an additional usability. Security is necessary so only logged in students can join courses. |
|                    | [24.04]   | [2767b3f](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/58/changes/2767b3ff47bc0e81950708e565f1c6f9e7cb7325) | Implementation of the live chat between all participants inside a session. | Users need the chat to communicate during a session. Only with the chat, our WebApp can be used remotely. |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | 22.04   | [f6a4ca1](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/f6a4ca18a375e96d94bb03846085d125afe3f68a) | Implemented chat messaging functionality with WebSocket support | Part of a whiteboard |
|                    | 23.04   | [f4f76c3](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/f4f76c31d479e419a9b88a78f26d3f6660c31d34) |  unit tests for course credential updates | tests for main functionalities |

---

## Contributions Week 5 - [25.04] to [03.05]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [29.04]   | [aea9990](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/60) | Added the possibility to upload PDFs with multiple pages to the teachers whiteboard | To have multiple pages of content like Slides |
|                    | [03.05]   | [181da74](https://github.com/MoritzDav/sopra-fs26-group-04-server/pull/124/) | Implemented WhiteBoardPageRepository and WhiteBoardStateDTO | So strokes and text is saved on the whiteboard after exiting the session |
| **[@AQuant1](https://github.com/AQuant1)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Bablandan](https://github.com/Bablandan)** | [02.05.]   | [6f1ecb](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/6f1ecbc5bf0de90d62f09ad5c0809b033810418c) | Creating BrowniePointEntry and repository | Necessary for our browniepoins leaderboard |
|                    | [02.05.]   | [19a89a8](https://github.com/MoritzDav/sopra-fs26-group-04-server/pull/146/commits/19a89a8c85e886283f8ee5e98b3cbdfc52a35373) | Creating POST and GET endpoint to save an entry and fetch the whole leaderboard of a specific course | Makes entries and leaderboard for a course available |
| **[@Meimira](https://github.com/Meimira)** | [03.05]   | [32882d9](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/63/changes/32882d95e8f6e7157f2c8eeb78b8ab048db365fe) | Add student leaderboard to course page | User story 5 |
|                    | [date]   | [9fb0bd7](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/63/changes/9fb0bd7fd0fccd6fd39eae4427ac7a255a6b127c) | Give a teacher the option to distribute brownie points for any student inside a session. | User story 5 |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |

---

## Contributions Week 6 - [04.05] to [10.05]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [07.05]   | [4c5c147](https://github.com/MoritzDav/sopra-fs26-group-04-server/pull/152) | Added GET and POST for PDF files in the session] | Saves uploaded PDFs |
|                    | [07.05]   | [789f70f](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/75) | On session join, the teacher's pre-uploaded session material is fetched and added to the File System | To upload and share teachers PDF |
| **[@AQuant1](https://github.com/AQuant1)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Bablandan](https://github.com/Bablandan)** | [07.05.]   | [d2a3992](https://github.com/MoritzDav/sopra-fs26-group-04-server/pull/151/changes/d2a399238b18f6c486227ae8640df3fda8571d3c) | Building websocket to broadcast student whiteboard | Necessary for our student based broadcast mode |
|                    | [07.05.]   | [0073f37](https://github.com/MoritzDav/sopra-fs26-group-04-server/pull/151/changes/0073f37c055ee2f31dc09319404bb97a2ae3b078) | Setting up repo, service, DTOs such that broadcasting of a student whiteboard is possible | Necessary for our student based broadcast mode |
| **[@Meimira](https://github.com/Meimira)** | [10.05]   | [c023b9f](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/76/changes/c023b9f5b38ade642d0e917dc4476527c001eaef) | A PDF of the teachers whiteboard is permanently stored in the course after they ended the session. + Some UI improvement (view PR for details) | User story 9 |
|                    | [10.05]   | [14cad8b](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/76/changes/14cad8b199a8d43701453d4cb5280bca378e4ada) | Students can now download a PDF of the session when they leave or the teacher ends it. The PDF shows a split page of the teacher and personal version. | User story 9 |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |


---

## Contributions Week 7 - [11.05] to [17.05]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [07.05]   | [789f70f](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/75) | Added page navigation controls (prev/next) to the student's personal whiteboard | So the students can browse through all pages of the teacher's uploaded material |
|                    | [07.05]   | [789f70f](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/75) | Added a folder icon button in the session header that opens a side panel displaying all pre-uploaded PDFs for the session, with the ability to upload additional files during the session | To upload files which students already worked on, or additional files like (Slides, Exercise, Assignment) |
| **[@AQuant1](https://github.com/AQuant1)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Bablandan](https://github.com/Bablandan)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Meimira](https://github.com/Meimira)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |

